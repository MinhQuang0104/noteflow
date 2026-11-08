<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Modules\Challenges\Application\Commands\MarkCompletionCommand;
use App\Modules\Challenges\Application\UseCases\MarkCompletionUseCase;
use App\Modules\Challenges\Domain\Exceptions\IdempotencyKeyReusedException;
use App\Modules\Challenges\Domain\Exceptions\InvalidCompletionDayException;
use App\Modules\Challenges\Domain\Exceptions\StaleDataEpochException;
use App\Modules\Challenges\Domain\Exceptions\WriteFenceActiveException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

final class ChallengeCompletionController extends Controller
{
    /** Done for account-today only; other dates and is_done false are field errors (Story 2.4 owns them). */
    public function mark(Request $request, string $id, string $date, MarkCompletionUseCase $useCase): JsonResponse
    {
        if (! Str::isUuid($id)) {
            return response()->json(['message' => 'Challenge not found'], 404);
        }

        /** @var User $owner */
        $owner = $request->user();
        $allowed = ['command_id', 'data_epoch', 'is_done'];
        $unexpected = array_diff(array_keys($request->all()), $allowed);
        if (! empty($unexpected)) {
            $errors = [];
            foreach ($unexpected as $field) {
                $errors[$field] = ["The {$field} field is not allowed."];
            }

            return response()->json(['message' => 'Validation failed', 'errors' => $errors], 422);
        }

        $validator = Validator::make($request->all(), [
            'command_id' => ['required', 'string', 'uuid'],
            'data_epoch' => ['required', 'integer', 'min:1'],
            'is_done' => ['required', 'boolean'],
        ]);
        $errors = $validator->errors()->toArray();
        // JSON booleans only: "true", 1 and similar loose forms are not accepted.
        if ($request->has('is_done') && ! is_bool($request->input('is_done')) && ! isset($errors['is_done'])) {
            $errors['is_done'] = ['The is_done field must be a JSON boolean.'];
        }
        if ($errors !== []) {
            return response()->json(['message' => 'Validation failed', 'errors' => $errors], 422);
        }

        try {
            $result = $useCase->execute(new MarkCompletionCommand(
                ownerId: $owner->id,
                challengeId: $id,
                localDate: $date,
                commandId: (string) $request->input('command_id'),
                dataEpoch: (int) $request->input('data_epoch'),
                isDone: (bool) $request->input('is_done'),
            ));
            if ($result === null) {
                return response()->json(['message' => 'Challenge not found'], 404);
            }

            return response()->json($result);
        } catch (WriteFenceActiveException $e) {
            return response()->json(['code' => 'write_fence_active', 'message' => $e->getMessage()], 423, ['Content-Type' => 'application/problem+json']);
        } catch (StaleDataEpochException $e) {
            return response()->json(['code' => 'stale_data_epoch', 'message' => $e->getMessage()], 409, ['Content-Type' => 'application/problem+json']);
        } catch (IdempotencyKeyReusedException $e) {
            return response()->json(['code' => 'idempotency_key_reused', 'message' => $e->getMessage()], 409, ['Content-Type' => 'application/problem+json']);
        } catch (InvalidCompletionDayException $e) {
            return response()->json(['message' => 'Validation failed', 'errors' => [$e->field => [$e->getMessage()]]], 422);
        }
    }
}
