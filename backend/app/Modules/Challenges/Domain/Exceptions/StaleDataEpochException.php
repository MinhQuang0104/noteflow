<?php

namespace App\Modules\Challenges\Domain\Exceptions;

use RuntimeException;

final class StaleDataEpochException extends RuntimeException
{
    public function __construct(string $message = 'Account data epoch has changed. Please refresh state.')
    {
        parent::__construct($message);
    }
}
