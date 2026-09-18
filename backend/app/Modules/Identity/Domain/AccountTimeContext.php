<?php

namespace App\Modules\Identity\Domain;

use DateTimeImmutable;
use DateTimeZone;

final readonly class AccountTimeContext
{
    public function __construct(
        public DateTimeImmutable $instant,
        public string $timezone,
        public string $accountDate,
        public string $weekStart,
        public string $weekEnd,
    ) {}

    public static function fromInstant(DateTimeImmutable $instant, string $timezone): self
    {
        $local = $instant->setTimezone(new DateTimeZone($timezone));
        $weekStart = $local
            ->setTime(0, 0)
            ->modify(sprintf('-%d days', (int) $local->format('N') - 1));

        return new self(
            instant: $instant,
            timezone: $timezone,
            accountDate: $local->format('Y-m-d'),
            weekStart: $weekStart->format('Y-m-d'),
            weekEnd: $weekStart->modify('+6 days')->format('Y-m-d'),
        );
    }

    /** @return array{timezone: string, account_date: string, week: array{start_date: string, end_date: string}} */
    public function toArray(): array
    {
        return [
            'timezone' => $this->timezone,
            'account_date' => $this->accountDate,
            'week' => [
                'start_date' => $this->weekStart,
                'end_date' => $this->weekEnd,
            ],
        ];
    }
}
