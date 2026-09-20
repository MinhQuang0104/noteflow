<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Modules\Identity\Application\AccountTimeContextFactory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use LogicException;

final class AccountContextController extends Controller
{
    public function __invoke(Request $request, AccountTimeContextFactory $factory): JsonResponse
    {
        /** @var User $owner */
        $owner = $request->user();
        $state = DB::table('account_states')
            ->where('owner_id', $owner->id)
            ->first();

        if ($state === null) {
            throw new LogicException('The provisioned owner is missing account state.');
        }

        $timeContext = $factory->capture((string) $state->timezone);

        return response()->json([
            ...$timeContext->toArray(),
            'account_revision' => (int) $state->account_revision,
            'data_epoch' => (int) $state->data_epoch,
            'write_state' => (string) $state->write_state,
        ]);
    }
}
