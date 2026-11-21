<?php

namespace App\Modules\Notes\Domain;

/**
 * The display label of a note, derived on read and never stored into title:
 * the trimmed title when it has a non-whitespace character, otherwise the
 * first body line with a non-whitespace character (trimmed), otherwise the
 * fallback label. Line breaks are LF, CRLF or CR.
 */
final class NoteLabel
{
    public const FALLBACK = 'Không tiêu đề';

    private const WHITESPACE = '[\s\p{Z}]';

    public static function for(string $title, string $body): string
    {
        if (self::hasText($title)) {
            return self::trim($title);
        }

        foreach (preg_split('/\r\n|\r|\n/', $body) ?: [] as $line) {
            if (self::hasText($line)) {
                return self::trim($line);
            }
        }

        return self::FALLBACK;
    }

    /**
     * True when the text has at least one character that is not whitespace,
     * using the same Unicode whitespace the label trims.
     */
    public static function hasText(string $text): bool
    {
        return preg_match('/[^\s\p{Z}]/u', $text) === 1;
    }

    private static function trim(string $text): string
    {
        return (string) preg_replace('/^'.self::WHITESPACE.'+|'.self::WHITESPACE.'+$/u', '', $text);
    }
}
