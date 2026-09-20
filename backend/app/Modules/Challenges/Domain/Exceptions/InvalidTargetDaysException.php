<?php

namespace App\Modules\Challenges\Domain\Exceptions;

use DomainException;

final class InvalidTargetDaysException extends DomainException
{
    public function __construct(int|string $targetDays)
    {
        parent::__construct("Target days must be an integer between 1 and 7, got: {$targetDays}");
    }
}
