<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Modules\Challenges\Application\Commands\CreateChallengeCommand;
use App\Modules\Challenges\Application\Commands\UpdateChallengeMetadataCommand;
use App\Modules\Challenges\Application\UseCases\CreateChallengeUseCase;
use App\Modules\Challenges\Application\UseCases\GetChallengeDetailQuery;
use App\Modules\Challenges\Application\UseCases\GetChallengeListQuery;
use App\Modules\Challenges\Application\UseCases\UpdateChallengeMetadataUseCase;
use App\Modules\Challenges\Domain\Exceptions\IdempotencyKeyReusedException;
use App\Modules\Challenges\Domain\Exceptions\InvalidChallengeNameException;
use App\Modules\Challenges\Domain\Exceptions\InvalidTargetDaysException;
use App\Modules\Challenges\Domain\Exceptions\StaleDataEpochException;
use App\Modules\Challenges\Domain\Exceptions\VersionConflictException;
use App\Modules\Challenges\Domain\Exceptions\WriteFenceActiveException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

final class ChallengeController extends Controller
{
    public function index(Request $request, GetChallengeListQuery $query): JsonResponse
    {
        /** @var User $owner */
        $owner = $request->user();

        return response()->json([
            'challenges' => $query->execute($owner->id),
        ]);
    }

    public function store(Request $request, CreateChallengeUseCase $useCase): JsonResponse
    {
        /** @var User $owner */
        $owner = $request->user();

        $allowed = ['command_id', 'data_epoch', 'name', 'description', 'target_days'];
        $unexpected = array_diff(array_keys($request->all()), $allowed);
        if (! empty($unexpected)) {
            $errors = [];
            foreach ($unexpected as $field) {
                $errors[$field] = ["The {$field} field is not allowed."];
            }

            return response()->json([
                'message' => 'Validation failed',
                'errors' => $errors,
            ], 422);
        }

        $validator = Validator::make($request->all(), [
            'command_id' => ['required', 'string', 'uuid'],
            'data_epoch' => ['required', 'integer', 'min:1'],
            'name' => ['required', 'string'],
            'description' => ['nullable', 'string'],
            'target_days' => ['required', 'integer', 'min:1', 'max:7'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Validation failed',
                'errors' => $validator->errors()->toArray(),
            ], 422);
        }

        $name = trim((string) $request->input('name'));
        if ($name === '' || mb_strlen($name) > 255) {
            return response()->json([
                'message' => 'Validation failed',
                'errors' => ['name' => ['Challenge name must be non-empty and less than 255 characters.']],
            ], 422);
        }

        try {
            $result = $useCase->execute(new CreateChallengeCommand(
                ownerId: $owner->id,
                commandId: (string) $request->input('command_id'),
                dataEpoch: (int) $request->input('data_epoch'),
                name: $name,
                description: $request->has('description') && $request->input('description') !== null ? (string) $request->input('description') : null,
                targetDays: (int) $request->input('target_days'),
            ));

            return response()->json($result, 201);
        } catch (WriteFenceActiveException $e) {
            return response()->json([
                'code' => 'write_fence_active',
                'message' => $e->getMessage(),
            ], 423, ['Content-Type' => 'application/problem+json']);
        } catch (StaleDataEpochException $e) {
            return response()->json([
                'code' => 'stale_data_epoch',
                'message' => $e->getMessage(),
            ], 409, ['Content-Type' => 'application/problem+json']);
        } catch (IdempotencyKeyReusedException $e) {
            return response()->json([
                'code' => 'idempotency_key_reused',
                'message' => $e->getMessage(),
            ], 409, ['Content-Type' => 'application/problem+json']);
        } catch (InvalidTargetDaysException $e) {
            return response()->json([
                'message' => 'Validation failed',
                'errors' => ['target_days' => [$e->getMessage()]],
            ], 422);
        } catch (InvalidChallengeNameException $e) {
            return response()->json([
                'message' => 'Validation failed',
                'errors' => ['name' => [$e->getMessage()]],
            ], 422);
        }
    }

    public function show(Request $request, string $id, GetChallengeDetailQuery $query): JsonResponse
    {
        if (! Str::isUuid($id)) {
            return response()->json(['message' => 'Challenge not found'], 404);
        }

        /** @var User $owner */
        $owner = $request->user();

        $detail = $query->execute($owner->id, $id);
        if ($detail === null) {
            return response()->json(['message' => 'Challenge not found'], 404);
        }

        return response()->json(['challenge' => $detail]);
    }

    public function update(Request $request, string $id, UpdateChallengeMetadataUseCase $useCase): JsonResponse
    {
        if (! Str::isUuid($id)) {
            return response()->json(['message' => 'Challenge not found'], 404);
        }

        /** @var User $owner */
        $owner = $request->user();

        $allowed = ['command_id', 'data_epoch', 'base_version', 'name', 'description'];
        $unexpected = array_diff(array_keys($request->all()), $allowed);
        if (! empty($unexpected)) {
            $errors = [];
            foreach ($unexpected as $field) {
                $errors[$field] = ["The {$field} field is not allowed."];
            }

            return response()->json([
                'message' => 'Validation failed',
                'errors' => $errors,
            ], 422);
        }

        $validator = Validator::make($request->all(), [
            'command_id' => ['required', 'string', 'uuid'],
            'data_epoch' => ['required', 'integer', 'min:1'],
            'base_version' => ['required', 'integer', 'min:1'],
            'name' => ['required', 'string'],
            'description' => ['nullable', 'string'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Validation failed',
                'errors' => $validator->errors()->toArray(),
            ], 422);
        }

        $name = trim((string) $request->input('name'));
        if ($name === '' || mb_strlen($name) > 255) {
            return response()->json([
                'message' => 'Validation failed',
                'errors' => ['name' => ['Challenge name must be non-empty and less than 255 characters.']],
            ], 422);
        }

        try {
            $result = $useCase->execute(new UpdateChallengeMetadataCommand(
                ownerId: $owner->id,
                challengeId: $id,
                commandId: (string) $request->input('command_id'),
                dataEpoch: (int) $request->input('data_epoch'),
                baseVersion: (int) $request->input('base_version'),
                name: $name,
                description: $request->has('description') && $request->input('description') !== null ? (string) $request->input('description') : null,
            ));

            if ($result === null) {
                return response()->json(['message' => 'Challenge not found'], 404);
            }

            return response()->json($result, 200);
        } catch (WriteFenceActiveException $e) {
            return response()->json([
                'code' => 'write_fence_active',
                'message' => $e->getMessage(),
            ], 423, ['Content-Type' => 'application/problem+json']);
        } catch (StaleDataEpochException $e) {
            return response()->json([
                'code' => 'stale_data_epoch',
                'message' => $e->getMessage(),
            ], 409, ['Content-Type' => 'application/problem+json']);
        } catch (IdempotencyKeyReusedException $e) {
            return response()->json([
                'code' => 'idempotency_key_reused',
                'message' => $e->getMessage(),
            ], 409, ['Content-Type' => 'application/problem+json']);
        } catch (VersionConflictException $e) {
            return response()->json([
                'code' => 'version_conflict',
                'message' => $e->getMessage(),
                'resource_id' => $e->resourceId,
                'current_version' => $e->currentVersion,
                'current_snapshot' => $e->currentSnapshot,
            ], 409, ['Content-Type' => 'application/problem+json']);
        } catch (InvalidChallengeNameException $e) {
            return response()->json([
                'message' => 'Validation failed',
                'errors' => ['name' => [$e->getMessage()]],
            ], 422);
        }
    }
}
