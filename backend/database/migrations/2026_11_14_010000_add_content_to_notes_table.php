<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Adds the note content and its version. Existing notes stay valid: they
     * get an empty title and body and row_version 1. The label is derived on
     * read, so there is no label column.
     */
    public function up(): void
    {
        Schema::table('notes', function (Blueprint $table) {
            $table->string('title', 255)->default('');
            $table->text('body')->default('');
            $table->unsignedInteger('row_version')->default(1);
        });

        DB::statement('ALTER TABLE notes ADD CONSTRAINT notes_row_version_positive CHECK (row_version >= 1)');
        DB::statement('ALTER TABLE notes ADD CONSTRAINT notes_body_max_length CHECK (char_length(body) <= 100000)');
        DB::statement('CREATE INDEX notes_owner_notebook_recent_index ON notes (owner_id, notebook_id, updated_at DESC, id)');
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS notes_owner_notebook_recent_index');
        DB::statement('ALTER TABLE notes DROP CONSTRAINT IF EXISTS notes_body_max_length');
        DB::statement('ALTER TABLE notes DROP CONSTRAINT IF EXISTS notes_row_version_positive');

        Schema::table('notes', function (Blueprint $table) {
            $table->dropColumn(['title', 'body', 'row_version']);
        });
    }
};
