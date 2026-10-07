<?php

namespace App\Providers;

use App\Modules\Identity\Contracts\Clock;
use App\Modules\Identity\Infrastructure\SystemClock;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->singleton(Clock::class, SystemClock::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        RateLimiter::for('login', function (Request $request): Limit {
            $emailInput = $request->input('email');
            $email = is_string($emailInput) ? mb_strtolower(trim($emailInput)) : '';

            return Limit::perMinute(5)->by($email.'|'.$request->ip());
        });
    }
}
