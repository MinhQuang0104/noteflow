<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('challenge_daily_records', function (Blueprint $table) {
            $table->foreignId('owner_id');
            $table->uuid('challenge_id');
            $table->date('local_date');
            $table->boolean('is_done')->default(false);
            $table->text('journal')->nullable();
            $table->unsignedInteger('completion_version')->default(0);
            $table->unsignedInteger('journal_version')->default(0);
            $table->unsignedInteger('row_version')->default(1);
            $table->timestamps();

            $table->primary(['challenge_id', 'local_date']);
            $table->index(['owner_id', 'challenge_id', 'local_date']);
            $table->foreign(['owner_id', 'challenge_id'])
                ->references(['owner_id', 'id'])
                ->on('challenges')
                ->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('challenge_daily_records');
    }
};
