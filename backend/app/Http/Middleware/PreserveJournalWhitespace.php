<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Foundation\Http\Middleware\TrimStrings as FrameworkTrimStrings;

final class PreserveJournalWhitespace extends FrameworkTrimStrings
{
    private bool $preserveJournal = false;

    public function handle($request, Closure $next)
    {
        $this->preserveJournal = $request->is('api/v1/challenges/*/journals/*');

        try {
            return parent::handle($request, $next);
        } finally {
            $this->preserveJournal = false;
        }
    }

    protected function transform($key, $value)
    {
        if ($this->preserveJournal && $key === 'journal') {
            return $value;
        }

        return parent::transform($key, $value);
    }
}
