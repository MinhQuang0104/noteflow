<?php

namespace App\Modules\Notes\Domain\Exceptions;

use RuntimeException;

final class VersionConflictException extends RuntimeException
{
    /**
     * @param  array{id: string, name: string, is_default: bool, row_version: int, note_count: int, created_at: string, updated_at: string}  $currentSnapshot
     */
    public function __construct(
        public readonly string $resourceId,
        public readonly int $currentVersion,
        public readonly array $currentSnapshot,
        string $message = 'The notebook has been updated by another session or device.'
    ) {
        parent::__construct($message);
    }
}
