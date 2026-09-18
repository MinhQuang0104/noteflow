<?php

use App\Http\Controllers\FoundationHealthController;
use Illuminate\Support\Facades\Route;

Route::get('/v1/foundation', FoundationHealthController::class)
    ->name('foundation.health');
