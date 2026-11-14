<?php

namespace App\Modules\Notes\Application\Commands;

final readonly class UpdateNoteCommand
{
    public function __construct(
        public int $ownerId,
        public string $noteId,
        public string $commandId,
        public int $dataEpoch,
        public int $baseVersion,
        public string $title,
        public string $body,
    ) {}
}
