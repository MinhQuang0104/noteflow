<?php

namespace App\Modules\Identity\Application;

use App\Modules\Identity\Contracts\Clock;
use App\Modules\Identity\Domain\AccountTimeContext;

final readonly class AccountTimeContextFactory
{
    public function __construct(private Clock $clock) {}

    public function capture(string $timezone): AccountTimeContext
    {
        return AccountTimeContext::fromInstant($this->clock->now(), $timezone);
    }
}
