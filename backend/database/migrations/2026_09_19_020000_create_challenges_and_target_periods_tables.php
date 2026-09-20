<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('challenges', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignId('owner_id')->constrained('users')->cascadeOnDelete();
            $table->string('name', 255);
            $table->text('description')->nullable();
            $table->date('start_date');
            $table->unsignedInteger('row_version')->default(1);
            $table->timestamps();

            $table->unique(['owner_id', 'id']);
            $table->index(['owner_id', 'created_at']);
            $table->index(['owner_id', 'start_date']);
        });

        Schema::create('challenge_target_periods', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->foreignId('owner_id')->constrained('users')->cascadeOnDelete();
            $table->uuid('challenge_id');
            $table->unsignedSmallInteger('target_days');
            $table->date('effective_from');
            $table->timestamps();

            $table->unique(['challenge_id', 'effective_from']);
            $table->index(['owner_id', 'challenge_id']);

            $table->foreign(['owner_id', 'challenge_id'])
                ->references(['owner_id', 'id'])
                ->on('challenges')
                ->cascadeOnDelete();
        });

        DB::statement('ALTER TABLE challenge_target_periods ADD CONSTRAINT challenge_target_periods_target_days_range CHECK (target_days BETWEEN 1 AND 7)');
    }

    public function down(): void
    {
        Schema::dropIfExists('challenge_target_periods');
        Schema::dropIfExists('challenges');
    }
};
