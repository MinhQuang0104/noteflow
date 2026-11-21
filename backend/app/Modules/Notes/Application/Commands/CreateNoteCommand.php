<?php

namespace App\Modules\Notes\Application\Commands;

final readonly class CreateNoteCommand
{
    public function __construct(
        public int $ownerId,
        public string $commandId,
        public int $dataEpoch,
        public string $notebookId,
        public string $title,
        public string $body,
    ) {}
}
