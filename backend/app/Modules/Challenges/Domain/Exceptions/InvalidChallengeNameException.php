<?php

namespace App\Modules\Challenges\Domain\Exceptions;

use DomainException;

final class InvalidChallengeNameException extends DomainException
{
    public function __construct(string $message = 'Challenge name must be non-empty and less than 255 characters.')
    {
        parent::__construct($message);
    }
}
