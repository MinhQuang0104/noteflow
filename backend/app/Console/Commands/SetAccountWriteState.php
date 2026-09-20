<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

final class SetAccountWriteState extends Command
{
    protected $signature = 'noteflow:set-write-state {state=open}';

    protected $description = 'Set account write state for test coordination';

    public function handle(): int
    {
        $state = (string) $this->argument('state');
        DB::table('account_states')->update(['write_state' => $state]);
        $this->info("Write state updated to {$state}");

        return self::SUCCESS;
    }
}
