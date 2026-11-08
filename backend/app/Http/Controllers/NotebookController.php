<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Modules\Notes\Application\Commands\CreateNotebookCommand;
use App\Modules\Notes\Application\Commands\DeleteNotebookCommand;
use App\Modules\Notes\Application\Commands\RenameNotebookCommand;
use App\Modules\Notes\Application\UseCases\CreateNotebookUseCase;
use App\Modules\Notes\Application\UseCases\DeleteNotebookUseCase;
use App\Modules\Notes\Application\UseCases\GetNotebookListQuery;
use App\Modules\Notes\Application\UseCases\RenameNotebookUseCase;
use App\Modules\Notes\Domain\Exceptions\IdempotencyKeyReusedException;
use App\Modules\Notes\Domain\Exceptions\InvalidNotebookNameException;
use App\Modules\Notes\Domain\Exceptions\NotebookNotDeletableException;
use App\Modules\Notes\Domain\Exceptions\StaleDataEpochException;
use App\Modules\Notes\Domain\Exceptions\VersionConflictException;
use App\Modules\Notes\Domain\Exceptions\WriteFenceActiveException;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

final class NotebookController extends Controller
{
    private const NAME_RULES = ['required', 'string', 'not_regex:/\x00/'];

    private const COMMAND_RULES = [
        'command_id' => ['required', 'string', 'uuid'],
        'data_epoch' => ['required', 'integer', 'min:1'],
    ];

    private const BASE_VERSION_RULES = ['required', 'integer', 'min:1'];

    public function index(Request $request, GetNotebookListQuery $query): JsonResponse
    {
        return response()->json([
            'notebooks' => $query->execute($this->owner($request)->id),
        ]);
    }

    public function store(Request $request, CreateNotebookUseCase $useCase): JsonResponse
    {
        $invalid = $this->validateBody($request, [...self::COMMAND_RULES, 'name' => self::NAME_RULES], withName: true);
        if ($invalid !== null) {
            return $invalid;
        }

        return $this->handle(function () use ($request, $useCase): JsonResponse {
            return response()->json($useCase->execute(new CreateNotebookCommand(
                ownerId: $this->owner($request)->id,
                commandId: (string) $request->input('command_id'),
                dataEpoch: (int) $request->input('data_epoch'),
                name: trim((string) $request->input('name')),
            )), 201);
        });
    }

    public function update(Request $request, string $id, RenameNotebookUseCase $useCase): JsonResponse
    {
        if (! Str::isUuid($id)) {
            return $this->notFound();
        }

        $invalid = $this->validateBody($request, [
            ...self::COMMAND_RULES,
            'base_version' => self::BASE_VERSION_RULES,
            'name' => self::NAME_RULES,
        ], withName: true);
        if ($invalid !== null) {
            return $invalid;
        }

        return $this->handle(function () use ($request, $id, $useCase): JsonResponse {
            $result = $useCase->execute(new RenameNotebookCommand(
                ownerId: $this->owner($request)->id,
                notebookId: $id,
                commandId: (string) $request->input('command_id'),
                dataEpoch: (int) $request->input('data_epoch'),
                baseVersion: (int) $request->input('base_version'),
                name: trim((string) $request->input('name')),
            ));

            return $result === null ? $this->notFound() : response()->json($result);
        });
    }

    public function destroy(Request $request, string $id, DeleteNotebookUseCase $useCase): JsonResponse
    {
        if (! Str::isUuid($id)) {
            return $this->notFound();
        }

        $invalid = $this->validateBody($request, [
            ...self::COMMAND_RULES,
            'base_version' => self::BASE_VERSION_RULES,
        ], withName: false);
        if ($invalid !== null) {
            return $invalid;
        }

        return $this->handle(function () use ($request, $id, $useCase): JsonResponse {
            $result = $useCase->execute(new DeleteNotebookCommand(
                ownerId: $this->owner($request)->id,
                notebookId: $id,
                commandId: (string) $request->input('command_id'),
                dataEpoch: (int) $request->input('data_epoch'),
                baseVersion: (int) $request->input('base_version'),
            ));

            return $result === null ? $this->notFound() : response()->json($result);
        });
    }

    private function owner(Request $request): User
    {
        /** @var User $owner */
        $owner = $request->user();

        return $owner;
    }

    /**
     * Rejects unknown fields (there is no parent or default flag to set), then
     * validates the declared fields and the trimmed name length.
     *
     * @param  array<string, list<string>>  $rules
     */
    private function validateBody(Request $request, array $rules, bool $withName): ?JsonResponse
    {
        $unexpected = array_diff(array_keys($request->all()), array_keys($rules));
        if ($unexpected !== []) {
            $errors = [];
            foreach ($unexpected as $field) {
                $errors[$field] = ["The {$field} field is not allowed."];
            }

            return $this->validationError($errors);
        }

        $validator = Validator::make($request->all(), $rules);
        if ($validator->fails()) {
            /** @var array<string, list<string>> $errors */
            $errors = $validator->errors()->toArray();

            return $this->validationError($errors);
        }

        if ($withName) {
            $name = trim((string) $request->input('name'));
            if ($name === '' || mb_strlen($name) > 255) {
                return $this->validationError(['name' => [(new InvalidNotebookNameException)->getMessage()]]);
            }
        }

        return null;
    }

    /**
     * @param  Closure(): JsonResponse  $action
     */
    private function handle(Closure $action): JsonResponse
    {
        try {
            return $action();
        } catch (WriteFenceActiveException $e) {
            return $this->problem('write_fence_active', $e->getMessage(), 423);
        } catch (StaleDataEpochException $e) {
            return $this->problem('stale_data_epoch', $e->getMessage(), 409);
        } catch (IdempotencyKeyReusedException $e) {
            return $this->problem('idempotency_key_reused', $e->getMessage(), 409);
        } catch (NotebookNotDeletableException $e) {
            return $this->problem($e->reason, $e->getMessage(), 409);
        } catch (VersionConflictException $e) {
            return response()->json([
                'code' => 'version_conflict',
                'message' => $e->getMessage(),
                'resource_id' => $e->resourceId,
                'current_version' => $e->currentVersion,
                'current_snapshot' => $e->currentSnapshot,
            ], 409, ['Content-Type' => 'application/problem+json']);
        } catch (InvalidNotebookNameException $e) {
            return $this->validationError(['name' => [$e->getMessage()]]);
        }
    }

    private function problem(string $code, string $message, int $status): JsonResponse
    {
        return response()->json([
            'code' => $code,
            'message' => $message,
        ], $status, ['Content-Type' => 'application/problem+json']);
    }

    /**
     * @param  array<string, list<string>>  $errors
     */
    private function validationError(array $errors): JsonResponse
    {
        return response()->json([
            'message' => 'Validation failed',
            'errors' => $errors,
        ], 422);
    }

    private function notFound(): JsonResponse
    {
        return response()->json(['message' => 'Notebook not found'], 404);
    }
}
