<?php

namespace App\Modules\Challenges\Domain\Exceptions;

use DomainException;

final class InvalidJournalTextException extends DomainException
{
    public function __construct()
    {
        parent::__construct('The journal must contain non-blank text.');
    }
}
