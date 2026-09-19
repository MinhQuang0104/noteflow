<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

final class ProvisionOwner extends Command
{
    private const ACCOUNT_TIMEZONE = 'Asia/Ho_Chi_Minh';

    protected $signature = 'noteflow:provision-owner {email} {--name=Owner}';

    protected $description = 'Provision the single NoteFlow owner account';

    public function handle(): int
    {
        $email = mb_strtolower(trim((string) $this->argument('email')));
        $password = (string) $this->secret('Owner password');
        $confirmation = (string) $this->secret('Confirm owner password');

        if (! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $this->error('A valid owner email is required.');

            return self::FAILURE;
        }

        if (mb_strlen($password) < 12 || $password !== $confirmation) {
            $this->error('Passwords must match and contain at least 12 characters.');

            return self::FAILURE;
        }

        DB::transaction(function () use ($email, $password): void {
            $previousOwnerIds = User::query()->where('is_owner', true)->pluck('id');
            User::query()->where('is_owner', true)->update(['is_owner' => false]);
            $owner = User::query()->updateOrCreate(
                ['email' => $email],
                [
                    'name' => (string) $this->option('name'),
                    'password' => $password,
                    'is_owner' => true,
                ],
            );

            DB::table('account_states')->where('owner_id', '<>', $owner->id)->delete();
            DB::table('account_states')->updateOrInsert(
                ['owner_id' => $owner->id],
                ['timezone' => self::ACCOUNT_TIMEZONE],
            );

            DB::table('sessions')
                ->whereIn('user_id', $previousOwnerIds->push($owner->id)->unique())
                ->delete();
        });

        $this->info('NoteFlow owner provisioned.');

        return self::SUCCESS;
    }
}
