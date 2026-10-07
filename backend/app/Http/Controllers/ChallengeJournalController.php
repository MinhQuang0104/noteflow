<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Modules\Challenges\Application\Commands\SaveJournalCommand;
use App\Modules\Challenges\Application\UseCases\GetJournalQuery;
use App\Modules\Challenges\Application\UseCases\SaveJournalUseCase;
use App\Modules\Challenges\Domain\Exceptions\IdempotencyKeyReusedException;
use App\Modules\Challenges\Domain\Exceptions\InvalidJournalDayException;
use App\Modules\Challenges\Domain\Exceptions\InvalidJournalTextException;
use App\Modules\Challenges\Domain\Exceptions\StaleDataEpochException;
use App\Modules\Challenges\Domain\Exceptions\VersionConflictException;
use App\Modules\Challenges\Domain\Exceptions\WriteFenceActiveException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

final class ChallengeJournalController extends Controller
{
    public function show(Request $request, string $id, string $date, GetJournalQuery $query): JsonResponse
    {
        if (! Str::isUuid($id)) {
            return response()->json(['message' => 'Challenge not found'], 404);
        }

        /** @var User $owner */
        $owner = $request->user();
        try {
            $journal = $query->execute($owner->id, $id, $date);
            if ($journal === null) {
                return response()->json(['message' => 'Challenge not found'], 404);
            }

            return response()->json(['journal' => $journal]);
        } catch (InvalidJournalDayException $e) {
            return response()->json(['message' => 'Validation failed', 'errors' => ['local_date' => [$e->getMessage()]]], 422);
        }
    }

    public function save(Request $request, string $id, string $date, SaveJournalUseCase $useCase): JsonResponse
    {
        if (! Str::isUuid($id)) {
            return response()->json(['message' => 'Challenge not found'], 404);
        }

        /** @var User $owner */
        $owner = $request->user();
        $allowed = ['command_id', 'data_epoch', 'base_version', 'journal'];
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
            'base_version' => ['required', 'integer', 'min:0'],
            'journal' => ['required', 'string', 'not_regex:/\x00/'],
        ]);
        if ($validator->fails()) {
            return response()->json(['message' => 'Validation failed', 'errors' => $validator->errors()->toArray()], 422);
        }

        try {
            $result = $useCase->execute(new SaveJournalCommand(
                ownerId: $owner->id,
                challengeId: $id,
                localDate: $date,
                commandId: (string) $request->input('command_id'),
                dataEpoch: (int) $request->input('data_epoch'),
                baseVersion: (int) $request->input('base_version'),
                journal: (string) $request->input('journal'),
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
        } catch (VersionConflictException $e) {
            return response()->json([
                'code' => 'version_conflict',
                'message' => $e->getMessage(),
                'resource_id' => $e->resourceId,
                'current_version' => $e->currentVersion,
                'current_snapshot' => $e->currentSnapshot,
            ], 409, ['Content-Type' => 'application/problem+json']);
        } catch (InvalidJournalDayException $e) {
            return response()->json(['message' => 'Validation failed', 'errors' => ['local_date' => [$e->getMessage()]]], 422);
        } catch (InvalidJournalTextException $e) {
            return response()->json(['message' => 'Validation failed', 'errors' => ['journal' => [$e->getMessage()]]], 422);
        }
    }
}
