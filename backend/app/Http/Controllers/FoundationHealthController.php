<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;

final class FoundationHealthController extends Controller
{
    public function __invoke(): JsonResponse
    {
        return response()->json([
            'status' => 'ok',
            'service' => 'noteflow-api',
        ]);
    }
}
