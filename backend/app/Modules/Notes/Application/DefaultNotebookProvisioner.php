<?php

namespace App\Modules\Notes\Application;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final readonly class DefaultNotebookProvisioner
{
    public const DEFAULT_NAME = 'Ghi chú nhanh';

    /**
     * Give the owner its default notebook if it has none. Idempotent: the
     * partial unique index on (owner_id) WHERE is_default turns a second
     * insert into a no-op, so an existing (possibly renamed) default is kept.
     * Run it inside the owner provisioning transaction.
     */
    public function ensure(int $ownerId): void
    {
        $now = now();

        DB::table('notebooks')->insertOrIgnore([
            'id' => (string) Str::uuid(),
            'owner_id' => $ownerId,
            'name' => self::DEFAULT_NAME,
            'is_default' => true,
            'row_version' => 1,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
    }
}
