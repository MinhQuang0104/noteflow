<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // Clean previous data
        DB::table('mutation_commands')->delete();
        DB::table('challenge_target_periods')->delete();
        DB::table('challenges')->delete();
        DB::table('sessions')->delete();

        $owner = User::updateOrCreate(
            ['email' => 'owner@example.test'],
            [
                'name' => 'NoteFlow Owner',
                'password' => 'secret123',
                'is_owner' => true,
            ]
        );

        DB::table('account_states')->updateOrInsert(
            ['owner_id' => $owner->id],
            [
                'timezone' => 'Asia/Ho_Chi_Minh',
                'account_revision' => 0,
                'data_epoch' => 1,
                'write_state' => 'open',
            ]
        );
    }
}
