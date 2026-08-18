import { IsEmail, IsString, Length, Matches, MinLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class HardDeleteRequestDto {
  @ApiProperty({ example: "admin@acme.io" })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: "12345" })
  @IsString()
  @Length(5, 5)
  @Matches(/^\d{5}$/)
  pin!: string;

  @ApiProperty({ example: "PRJ-0001" })
  @IsString()
  @MinLength(1)
  id!: string;
}

