<?php

namespace Tests\Contract;

use League\OpenAPIValidation\PSR7\OperationAddress;
use League\OpenAPIValidation\PSR7\ResponseValidator;
use League\OpenAPIValidation\PSR7\ValidatorBuilder;
use Psr\Http\Message\ResponseInterface;

final class OpenApiResponseValidator
{
    private readonly ResponseValidator $validator;

    public function __construct(string $specPath)
    {
        $this->validator = (new ValidatorBuilder)
            ->fromYamlFile($specPath)
            ->getResponseValidator();
    }

    public function validate(string $method, string $path, ResponseInterface $response): void
    {
        $this->validator->validate(
            new OperationAddress($path, strtolower($method)),
            $response,
        );
    }
}
