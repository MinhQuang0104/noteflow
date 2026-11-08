<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration
{
    /**
     * Frozen copy of the default notebook name at the time of this migration.
     * Runtime provisioning uses DefaultNotebookProvisioner::DEFAULT_NAME.
     */
    private const DEFAULT_NOTEBOOK_NAME = 'Ghi chú nhanh';

    public function up(): void
    {
        Schema::create('notebooks', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignId('owner_id')->constrained('users')->cascadeOnDelete();
            $table->string('name', 255);
            $table->boolean('is_default')->default(false);
            $table->unsignedInteger('row_version')->default(1);
            $table->timestamps();

            // Owner-compatible target for notes (owner_id, notebook_id).
            $table->unique(['owner_id', 'id']);
            $table->index(['owner_id', 'created_at', 'id']);
        });

        DB::statement("ALTER TABLE notebooks ADD CONSTRAINT notebooks_name_not_blank CHECK (btrim(name) <> '')");
        DB::statement('ALTER TABLE notebooks ADD CONSTRAINT notebooks_row_version_positive CHECK (row_version >= 1)');
        // At most one default notebook per owner; provisioning guarantees at least one.
        DB::statement('CREATE UNIQUE INDEX notebooks_one_default_per_owner ON notebooks (owner_id) WHERE is_default');

        Schema::create('notes', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignId('owner_id')->constrained('users')->cascadeOnDelete();
            $table->uuid('notebook_id');
            $table->timestamps();

            $table->unique(['owner_id', 'id']);
            $table->index(['owner_id', 'notebook_id']);

            // A note can only live in a notebook of the same owner, and a
            // notebook that still holds notes cannot be deleted.
            $table->foreign(['owner_id', 'notebook_id'])
                ->references(['owner_id', 'id'])
                ->on('notebooks')
                ->restrictOnDelete();
        });

        $now = now();
        DB::table('account_states')
            ->orderBy('owner_id')
            ->pluck('owner_id')
            ->each(function (mixed $ownerId) use ($now): void {
                DB::table('notebooks')->insert([
                    'id' => (string) Str::uuid(),
                    'owner_id' => (int) $ownerId,
                    'name' => self::DEFAULT_NOTEBOOK_NAME,
                    'is_default' => true,
                    'row_version' => 1,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            });
    }

    public function down(): void
    {
        Schema::dropIfExists('notes');
        Schema::dropIfExists('notebooks');
    }
};
