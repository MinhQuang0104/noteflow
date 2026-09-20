<?php

use App\Http\Controllers\AccountContextController;
use App\Http\Controllers\Auth\AuthenticatedSessionController;
use App\Http\Controllers\ChallengeController;
use App\Http\Controllers\FoundationHealthController;
use Illuminate\Support\Facades\Route;

Route::get('/v1/foundation', FoundationHealthController::class)
    ->name('foundation.health');

Route::get('/v1/session', [AuthenticatedSessionController::class, 'show'])
    ->middleware(['private.no-store', 'auth:sanctum', 'owner'])
    ->name('session.show');

Route::get('/v1/account', AccountContextController::class)
    ->middleware(['private.no-store', 'auth:sanctum', 'owner'])
    ->name('account.show');

Route::get('/v1/challenges', [ChallengeController::class, 'index'])
    ->middleware(['private.no-store', 'auth:sanctum', 'owner'])
    ->name('challenges.index');

Route::post('/v1/challenges', [ChallengeController::class, 'store'])
    ->middleware(['private.no-store', 'auth:sanctum', 'owner'])
    ->name('challenges.store');

Route::get('/v1/challenges/{id}', [ChallengeController::class, 'show'])
    ->middleware(['private.no-store', 'auth:sanctum', 'owner'])
    ->name('challenges.show');

Route::patch('/v1/challenges/{id}', [ChallengeController::class, 'update'])
    ->middleware(['private.no-store', 'auth:sanctum', 'owner'])
    ->name('challenges.update');
