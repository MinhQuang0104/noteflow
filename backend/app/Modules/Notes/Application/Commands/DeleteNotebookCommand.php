<?php

namespace App\Modules\Notes\Application\Commands;

final readonly class DeleteNotebookCommand
{
    public function __construct(
        public int $ownerId,
        public string $notebookId,
        public string $commandId,
        public int $dataEpoch,
        public int $baseVersion,
    ) {}
}
