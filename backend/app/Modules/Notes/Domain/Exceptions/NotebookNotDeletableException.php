<?php

namespace App\Modules\Notes\Domain\Exceptions;

use DomainException;

final class NotebookNotDeletableException extends DomainException
{
    public const IS_DEFAULT = 'notebook_is_default';

    public const NOT_EMPTY = 'notebook_not_empty';

    /**
     * @param  self::IS_DEFAULT|self::NOT_EMPTY  $reason
     */
    public function __construct(public readonly string $reason)
    {
        parent::__construct(match ($reason) {
            self::IS_DEFAULT => 'Không thể xóa vở mặc định.',
            self::NOT_EMPTY => 'Vở vẫn còn ghi chú. Hãy chuyển hoặc xóa các ghi chú trước khi xóa vở.',
        });
    }

    public static function isDefault(): self
    {
        return new self(self::IS_DEFAULT);
    }

    public static function notEmpty(): self
    {
        return new self(self::NOT_EMPTY);
    }
}
