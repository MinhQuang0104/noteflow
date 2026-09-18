<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\LoginRequest;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\Response;

final class AuthenticatedSessionController extends Controller
{
    private const PRIVATE_ROUTES = ['/today', '/challenges', '/notes', '/calendar', '/settings'];

    public function store(LoginRequest $request): JsonResponse
    {
        $credentials = $request->safe()->only(['email', 'password']);
        $credentials['is_owner'] = true;

        if (! Auth::attempt($credentials)) {
            throw ValidationException::withMessages([
                'email' => ['Thông tin đăng nhập không hợp lệ.'],
            ]);
        }

        $request->session()->regenerate();

        /** @var User $owner */
        $owner = $request->user();

        return response()->json([
            'owner' => $this->ownerPayload($owner),
            'redirect_to' => $this->safeRedirect($request->validated('redirect_to')),
        ])->header('Cache-Control', 'private, no-store');
    }

    public function show(Request $request): JsonResponse
    {
        /** @var User $owner */
        $owner = $request->user();

        return response()->json(['owner' => $this->ownerPayload($owner)]);
    }

    public function destroy(Request $request): Response
    {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->noContent();
    }

    /** @return array{id: int, name: string, email: string} */
    private function ownerPayload(User $owner): array
    {
        return [
            'id' => $owner->id,
            'name' => $owner->name,
            'email' => $owner->email,
        ];
    }

    private function safeRedirect(mixed $destination): string
    {
        return in_array($destination, self::PRIVATE_ROUTES, true) ? $destination : '/today';
    }
}
