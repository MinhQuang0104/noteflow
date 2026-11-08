<?php

namespace App\Modules\Notes\Application\Commands;

final readonly class CreateNotebookCommand
{
    public function __construct(
        public int $ownerId,
        public string $commandId,
        public int $dataEpoch,
        public string $name,
    ) {}
}
