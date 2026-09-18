<?php

use App\Modules\Identity\Application\AccountTimeContextFactory;
use App\Modules\Identity\Contracts\Clock;
use App\Modules\Identity\Domain\AccountTimeContext;

test('account time uses Ho Chi Minh midnight and Monday week boundaries', function (string $instant, array $expected) {
    $originalTimezone = date_default_timezone_get();
    date_default_timezone_set('America/Los_Angeles');

    try {
        $context = AccountTimeContext::fromInstant(
            new DateTimeImmutable($instant),
            'Asia/Ho_Chi_Minh',
        );
    } finally {
        date_default_timezone_set($originalTimezone);
    }

    expect($context->toArray())->toBe($expected);
})->with([
    'last second of Sunday in the account timezone' => [
        '2026-09-20T16:59:59+00:00',
        [
            'timezone' => 'Asia/Ho_Chi_Minh',
            'account_date' => '2026-09-20',
            'week' => ['start_date' => '2026-09-14', 'end_date' => '2026-09-20'],
        ],
    ],
    'first second of Monday in the account timezone' => [
        '2026-09-20T17:00:00+00:00',
        [
            'timezone' => 'Asia/Ho_Chi_Minh',
            'account_date' => '2026-09-21',
            'week' => ['start_date' => '2026-09-21', 'end_date' => '2026-09-27'],
        ],
    ],
]);

test('a use case captures the authoritative clock exactly once', function () {
    $clock = new class implements Clock
    {
        public int $calls = 0;

        public function now(): DateTimeImmutable
        {
            $this->calls++;

            return $this->calls === 1
                ? new DateTimeImmutable('2026-09-20T16:59:59+00:00')
                : new DateTimeImmutable('2026-09-20T17:00:00+00:00');
        }
    };

    $context = (new AccountTimeContextFactory($clock))->capture('Asia/Ho_Chi_Minh');

    expect($clock->calls)->toBe(1)
        ->and($context->accountDate)->toBe('2026-09-20')
        ->and($context->weekStart)->toBe('2026-09-14')
        ->and($context->weekEnd)->toBe('2026-09-20');
});
