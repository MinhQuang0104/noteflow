<?php

namespace App\Modules\Notes\Domain\Exceptions;

use DomainException;

/**
 * The note content breaks a rule: a create whose title and body are both
 * blank (note_empty), or a title or body over its length limit (a field
 * error on that field).
 */
final class InvalidNoteContentException extends DomainException
{
    public const NOTE_EMPTY = 'note_empty';

    public const TITLE_MAX_LENGTH = 255;

    public const BODY_MAX_LENGTH = 100000;

    private function __construct(
        public readonly string $reason,
        public readonly ?string $field,
        string $message,
    ) {
        parent::__construct($message);
    }

    public static function empty(): self
    {
        return new self(self::NOTE_EMPTY, null, 'Note cần có tiêu đề hoặc nội dung.');
    }

    public static function titleTooLong(): self
    {
        return new self('title_too_long', 'title', 'Tiêu đề tối đa '.self::TITLE_MAX_LENGTH.' ký tự.');
    }

    public static function bodyTooLong(): self
    {
        return new self('body_too_long', 'body', 'Nội dung tối đa '.self::BODY_MAX_LENGTH.' ký tự.');
    }

    /**
     * Length limits that apply to every note write, counted in characters.
     */
    public static function assertLengths(string $title, string $body): void
    {
        if (mb_strlen($title) > self::TITLE_MAX_LENGTH) {
            throw self::titleTooLong();
        }

        if (mb_strlen($body) > self::BODY_MAX_LENGTH) {
            throw self::bodyTooLong();
        }
    }
}
