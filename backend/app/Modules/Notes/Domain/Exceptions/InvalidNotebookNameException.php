<?php

namespace App\Modules\Notes\Domain\Exceptions;

use DomainException;

final class InvalidNotebookNameException extends DomainException
{
    public function __construct(string $message = 'Tên vở không được để trống và tối đa 255 ký tự.')
    {
        parent::__construct($message);
    }
}
