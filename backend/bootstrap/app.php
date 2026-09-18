<?php

use App\Http\Middleware\EnsureOwner;
use App\Http\Middleware\PrivateNoStore;
use Illuminate\Contracts\Auth\Middleware\AuthenticatesRequests;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Session\TokenMismatchException;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\HttpException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->statefulApi();
        $middleware->alias([
            'owner' => EnsureOwner::class,
            'private.no-store' => PrivateNoStore::class,
        ]);
        $middleware->prependToPriorityList(AuthenticatesRequests::class, PrivateNoStore::class);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->render(function (HttpException $exception, Request $request) {
            if (
                $exception->getStatusCode() === 419
                && $exception->getPrevious() instanceof TokenMismatchException
                && $request->is('login', 'logout')
            ) {
                return response()->json([
                    'message' => 'Phiên bảo mật đã hết hạn. Vui lòng thử lại.',
                    'code' => 'csrf_expired',
                ], 419);
            }
        });

        $exceptions->respond(function (Response $response, Throwable $exception, Request $request): Response {
            if ($request->is('login', 'logout', 'api/v1/session')) {
                $response->headers->set('Cache-Control', 'private, no-store');
            }

            return $response;
        });
    })->create();
