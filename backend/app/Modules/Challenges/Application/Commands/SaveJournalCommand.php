<?php

namespace App\Modules\Challenges\Application\Commands;

final readonly class SaveJournalCommand
{
    public function __construct(
        public int $ownerId,
        public string $challengeId,
        public string $localDate,
        public string $commandId,
        public int $dataEpoch,
        public int $baseVersion,
        public string $journal,
    ) {}
}
