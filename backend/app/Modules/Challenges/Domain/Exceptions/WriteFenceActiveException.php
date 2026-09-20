<?php

namespace App\Modules\Challenges\Domain\Exceptions;

use RuntimeException;

final class WriteFenceActiveException extends RuntimeException
{
    public function __construct(string $message = 'Account writes are locked for maintenance or restore.')
    {
        parent::__construct($message);
    }
}
