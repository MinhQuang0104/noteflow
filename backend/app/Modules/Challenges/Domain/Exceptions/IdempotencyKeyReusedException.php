<?php

namespace App\Modules\Challenges\Domain\Exceptions;

use RuntimeException;

final class IdempotencyKeyReusedException extends RuntimeException
{
    public function __construct(string $message = 'Idempotency key has already been used with a different request payload.')
    {
        parent::__construct($message);
    }
}
