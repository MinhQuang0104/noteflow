<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->boolean('is_owner')->default(false);
        });

        DB::statement('CREATE UNIQUE INDEX users_single_owner ON users (is_owner) WHERE is_owner = true');
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS users_single_owner');

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('is_owner');
        });
    }
};
