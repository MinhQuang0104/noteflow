<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('account_states', function (Blueprint $table) {
            $table->unsignedBigInteger('account_revision')->default(0);
            $table->unsignedInteger('data_epoch')->default(1);
            $table->string('write_state', 32)->default('open');
        });

        DB::statement("ALTER TABLE account_states ADD CONSTRAINT account_states_valid_write_state CHECK (write_state IN ('open', 'locked_for_import'))");

        DB::table('account_states')->whereNull('account_revision')->update(['account_revision' => 0]);
        DB::table('account_states')->whereNull('data_epoch')->update(['data_epoch' => 1]);
        DB::table('account_states')->whereNull('write_state')->update(['write_state' => 'open']);
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE account_states DROP CONSTRAINT IF EXISTS account_states_valid_write_state');

        Schema::table('account_states', function (Blueprint $table) {
            $table->dropColumn(['account_revision', 'data_epoch', 'write_state']);
        });
    }
};
