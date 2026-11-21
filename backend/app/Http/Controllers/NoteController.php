<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Modules\Notes\Application\Commands\CreateNoteCommand;
use App\Modules\Notes\Application\Commands\UpdateNoteCommand;
use App\Modules\Notes\Application\UseCases\CreateNoteUseCase;
use App\Modules\Notes\Application\UseCases\GetNoteListQuery;
use App\Modules\Notes\Application\UseCases\UpdateNoteUseCase;
use App\Modules\Notes\Domain\Exceptions\IdempotencyKeyReusedException;
use App\Modules\Notes\Domain\Exceptions\InvalidNoteContentException;
use App\Modules\Notes\Domain\Exceptions\StaleDataEpochException;
use App\Modules\Notes\Domain\Exceptions\WriteFenceActiveException;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

final class NoteController extends Controller
{
    private const COMMAND_RULES = [
        'command_id' => ['required', 'string', 'uuid'],
        'data_epoch' => ['required', 'integer', 'min:1'],
    ];

    private const CONTENT_FIELDS = ['title', 'body'];

    public function index(Request $request, string $id, GetNoteListQuery $query): JsonResponse
    {
        if (! Str::isUuid($id)) {
            return $this->notFound('Notebook not found');
        }

        $notes = $query->execute($this->owner($request)->id, $id);

        return $notes === null
            ? $this->notFound('Notebook not found')
            : response()->json(['notes' => $notes]);
    }

    public function store(Request $request, CreateNoteUseCase $useCase): JsonResponse
    {
        $payload = $this->validatedPayload($request, [
            ...self::COMMAND_RULES,
            'notebook_id' => ['required', 'string', 'uuid'],
        ]);
        if ($payload instanceof JsonResponse) {
            return $payload;
        }

        return $this->handle(function () use ($request, $payload, $useCase): JsonResponse {
            $result = $useCase->execute(new CreateNoteCommand(
                ownerId: $this->owner($request)->id,
                commandId: (string) $payload['command_id'],
                dataEpoch: (int) $payload['data_epoch'],
                notebookId: strtolower((string) $payload['notebook_id']),
                title: (string) $payload['title'],
                body: (string) $payload['body'],
            ));

            return $result === null ? $this->notFound('Notebook not found') : response()->json($result, 201);
        });
    }

    public function update(Request $request, string $id, UpdateNoteUseCase $useCase): JsonResponse
    {
        if (! Str::isUuid($id)) {
            return $this->notFound('Note not found');
        }

        $payload = $this->validatedPayload($request, [
            ...self::COMMAND_RULES,
            'base_version' => ['required', 'integer', 'min:1'],
        ]);
        if ($payload instanceof JsonResponse) {
            return $payload;
        }

        return $this->handle(function () use ($request, $id, $payload, $useCase): JsonResponse {
            $result = $useCase->execute(new UpdateNoteCommand(
                ownerId: $this->owner($request)->id,
                noteId: strtolower($id),
                commandId: (string) $payload['command_id'],
                dataEpoch: (int) $payload['data_epoch'],
                baseVersion: (int) $payload['base_version'],
                title: (string) $payload['title'],
                body: (string) $payload['body'],
            ));

            if ($result === null) {
                return $this->notFound('Note not found');
            }

            if (isset($result['conflict'])) {
                $current = $result['conflict'];

                return response()->json([
                    'code' => 'version_conflict',
                    'message' => 'The note has been updated by another session or device.',
                    'resource_id' => $current['id'],
                    'current_version' => $current['row_version'],
                    'current_snapshot' => $current,
                ], 409, ['Content-Type' => 'application/problem+json']);
            }

            return response()->json($result);
        });
    }

    private function owner(Request $request): User
    {
        /** @var User $owner */
        $owner = $request->user();

        return $owner;
    }

    /**
     * Reads the JSON body as sent. The global TrimStrings and
     * ConvertEmptyStringsToNull middleware rewrite the parsed input, but a
     * note title and body are stored exactly as sent, including surrounding
     * whitespace and line breaks, so the raw body is the source.
     *
     * Rejects unknown fields, validates the command fields, and requires a
     * title and body string within their length limits.
     *
     * @param  array<string, list<string>>  $rules
     * @return array<string, mixed>|JsonResponse
     */
    private function validatedPayload(Request $request, array $rules): array|JsonResponse
    {
        $content = $request->getContent();
        $payload = $content === '' ? [] : json_decode($content, true);
        if (! is_array($payload) || ($payload !== [] && array_is_list($payload))) {
            return $this->validationError(['request' => ['The request body must be a JSON object.']]);
        }

        /** @var array<string, mixed> $payload */
        $allowed = [...array_keys($rules), ...self::CONTENT_FIELDS];
        $unexpected = array_diff(array_keys($payload), $allowed);
        if ($unexpected !== []) {
            $errors = [];
            foreach ($unexpected as $field) {
                $errors[$field] = ["The {$field} field is not allowed."];
            }

            return $this->validationError($errors);
        }

        $validator = Validator::make($payload, $rules);
        /** @var array<string, list<string>> $errors */
        $errors = $validator->errors()->toArray();

        foreach (self::CONTENT_FIELDS as $field) {
            $error = $this->contentError($field, $payload);
            if ($error !== null) {
                $errors[$field] = [$error];
            }
        }

        return $errors === [] ? $payload : $this->validationError($errors);
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function contentError(string $field, array $payload): ?string
    {
        if (! array_key_exists($field, $payload)) {
            return "The {$field} field is required.";
        }

        $value = $payload[$field];
        if (! is_string($value)) {
            return "The {$field} field must be a string.";
        }

        if (str_contains($value, "\0")) {
            return "The {$field} field must not contain a null character.";
        }

        $limit = $field === 'title'
            ? InvalidNoteContentException::TITLE_MAX_LENGTH
            : InvalidNoteContentException::BODY_MAX_LENGTH;
        if (mb_strlen($value) > $limit) {
            return $field === 'title'
                ? InvalidNoteContentException::titleTooLong()->getMessage()
                : InvalidNoteContentException::bodyTooLong()->getMessage();
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
        } catch (InvalidNoteContentException $e) {
            if ($e->field === null) {
                return $this->problem($e->reason, $e->getMessage(), 422);
            }

            return $this->validationError([$e->field => [$e->getMessage()]]);
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

    private function notFound(string $message): JsonResponse
    {
        return response()->json(['message' => $message], 404);
    }
}
