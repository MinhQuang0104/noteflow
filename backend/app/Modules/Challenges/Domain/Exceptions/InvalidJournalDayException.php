<?php

namespace App\Modules\Challenges\Domain\Exceptions;

use DomainException;

final class InvalidJournalDayException extends DomainException
{
    public function __construct()
    {
        parent::__construct('The journal day is outside the valid challenge range.');
    }
}
