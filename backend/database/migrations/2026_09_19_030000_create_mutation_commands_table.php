<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('mutation_commands', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->foreignId('owner_id')->constrained('users')->cascadeOnDelete();
            $table->unsignedInteger('data_epoch');
            $table->uuid('command_id');
            $table->string('command_type', 64);
            $table->char('request_hash', 64);
            $table->uuid('resource_id')->nullable();
            $table->jsonb('response_payload');
            $table->unsignedSmallInteger('response_status');
            $table->timestamp('created_at')->useCurrent();

            $table->unique(['owner_id', 'data_epoch', 'command_id']);
            $table->index(['owner_id', 'data_epoch']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('mutation_commands');
    }
};
