<?php

namespace App\Modules\Challenges\Domain\Exceptions;

use DomainException;

final class InvalidCompletionDayException extends DomainException
{
    /** @param  'local_date'|'is_done'  $field */
    public function __construct(public readonly string $field = 'local_date')
    {
        parent::__construct($field === 'is_done'
            ? 'Only marking a day as Done is supported.'
            : 'Done can only be recorded for the account-today date.');
    }
}
