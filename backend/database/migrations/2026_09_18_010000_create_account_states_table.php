<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const TIMEZONE = 'Asia/Ho_Chi_Minh';

    public function up(): void
    {
        Schema::create('account_states', function (Blueprint $table) {
            $table->foreignId('owner_id')->primary()->constrained('users')->cascadeOnDelete();
            $table->string('timezone', 64)->default(self::TIMEZONE);
        });

        DB::statement("ALTER TABLE account_states ADD CONSTRAINT account_states_fixed_timezone CHECK (timezone = 'Asia/Ho_Chi_Minh')");

        DB::table('users')
            ->where('is_owner', true)
            ->orderBy('id')
            ->eachById(function (object $owner): void {
                DB::table('account_states')->insert([
                    'owner_id' => $owner->id,
                    'timezone' => self::TIMEZONE,
                ]);
            });
    }

    public function down(): void
    {
        Schema::dropIfExists('account_states');
    }
};
