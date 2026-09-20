<?php

namespace App\Modules\Challenges\Domain\Exceptions;

use RuntimeException;

final class VersionConflictException extends RuntimeException
{
    /**
     * @param  array<string, mixed>  $currentSnapshot
     */
    public function __construct(
        public readonly string $resourceId,
        public readonly int $currentVersion,
        public readonly array $currentSnapshot,
        string $message = 'The resource has been updated by another session or device.'
    ) {
        parent::__construct($message);
    }
}
