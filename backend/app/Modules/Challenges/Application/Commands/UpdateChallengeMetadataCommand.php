<?php

namespace App\Modules\Challenges\Application\Commands;

final readonly class UpdateChallengeMetadataCommand
{
    public function __construct(
        public int $ownerId,
        public string $challengeId,
        public string $commandId,
        public int $dataEpoch,
        public int $baseVersion,
        public string $name,
        public ?string $description,
    ) {}
}
