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
        $timezone = DB::table('account_states')
            ->where('owner_id', $owner->id)
            ->value('timezone');

        if (! is_string($timezone)) {
            throw new LogicException('The provisioned owner is missing account state.');
        }

        return response()->json($factory->capture($timezone)->toArray());
    }
}
