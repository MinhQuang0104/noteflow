<?php

use App\Modules\Notes\Domain\NoteLabel;

test('the label is the trimmed title when the title has a non-whitespace character', function () {
    expect(NoteLabel::for('  Kế hoạch tuần  ', 'Dòng body'))->toBe('Kế hoạch tuần')
        ->and(NoteLabel::for('Tiêu đề', ''))->toBe('Tiêu đề')
        ->and(NoteLabel::for("\tÝ tưởng\n", "\n\nKhông dùng"))->toBe('Ý tưởng');
});

test('a whitespace-only title falls back to the first body line with a non-whitespace character, trimmed', function () {
    expect(NoteLabel::for('', 'Mua sữa'))->toBe('Mua sữa')
        ->and(NoteLabel::for('   ', "  Gọi cho mẹ  \nDòng hai"))->toBe('Gọi cho mẹ')
        ->and(NoteLabel::for("\t \u{00A0}", "Dòng đầu\nDòng hai"))->toBe('Dòng đầu');
});

test('leading blank body lines are skipped, with LF, CRLF and CR line breaks', function () {
    expect(NoteLabel::for('', "\n\n   \n  Dòng thật  \nSau"))->toBe('Dòng thật')
        ->and(NoteLabel::for('', "\r\n \t\r\nCRLF line\r\nnext"))->toBe('CRLF line')
        ->and(NoteLabel::for(' ', "\r\rCR line\rnext"))->toBe('CR line');
});

test('a note with no non-whitespace text is labelled Không tiêu đề', function () {
    expect(NoteLabel::for('', ''))->toBe('Không tiêu đề')
        ->and(NoteLabel::for('   ', "\n \r\n\t\n"))->toBe('Không tiêu đề')
        ->and(NoteLabel::FALLBACK)->toBe('Không tiêu đề');
});

test('the label never changes the title or body it is derived from', function () {
    $title = '   ';
    $body = "\nNội dung\n";

    expect(NoteLabel::for($title, $body))->toBe('Nội dung')
        ->and($title)->toBe('   ')
        ->and($body)->toBe("\nNội dung\n");
});
