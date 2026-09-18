<?php

use App\Http\Controllers\Auth\AuthenticatedSessionController;
use App\Http\Controllers\FoundationHealthController;
use Illuminate\Support\Facades\Route;

Route::get('/v1/foundation', FoundationHealthController::class)
    ->name('foundation.health');

Route::get('/v1/session', [AuthenticatedSessionController::class, 'show'])
    ->middleware(['private.no-store', 'auth:sanctum', 'owner'])
    ->name('session.show');
