<?php

namespace App\Modules\Challenges\Application\Commands;

final readonly class CreateChallengeCommand
{
    public function __construct(
        public int $ownerId,
        public string $commandId,
        public int $dataEpoch,
        public string $name,
        public ?string $description,
        public int $targetDays,
    ) {}
}
