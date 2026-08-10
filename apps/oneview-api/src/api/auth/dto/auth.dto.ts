import { IsEmail, IsString, Length, Matches } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class LoginDto {
  @ApiProperty({ example: "admin@acme.io" })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: "12345" })
  @IsString()
  @Length(5, 5)
  @Matches(/^\d{5}$/)
  pin!: string;
}

export class RefreshDto {
  @ApiProperty()
  @IsString()
  refreshToken!: string;
}

export class ForgotPinDto {
  @ApiProperty()
  @IsEmail()
  email!: string;
}

export class ResetPinDto {
  @ApiProperty()
  @IsString()
  token!: string;

  @ApiProperty()
  @IsString()
  @Length(5, 5)
  @Matches(/^\d{5}$/)
  pin!: string;
}

export class ChangePinDto {
  @ApiProperty({ example: "12345" })
  @IsString()
  @Length(5, 5)
  @Matches(/^\d{5}$/)
  currentPin!: string;

  @ApiProperty({ example: "54321" })
  @IsString()
  @Length(5, 5)
  @Matches(/^\d{5}$/)
  newPin!: string;
}

export class VerifyPinDto {
  @ApiProperty({ example: "12345" })
  @IsString()
  @Length(5, 5)
  @Matches(/^\d{5}$/)
  pin!: string;
}
