import { Body, Controller, Get, Param, Patch, Post, Put, Req, UseGuards } from '@nestjs/common';
import { resolvedActorFromRequest, RequireAdminGuard } from '../service-requests/auth.guard';
import { AdminService } from './admin.service';
import { CreateDepartmentDto, CreateUserDto, DeactivateUserDto, UpdateDepartmentDto, UpdateMappingDto, UpdateSettingsDto, UpdateUserDto } from './dto';

@Controller('admin')
@UseGuards(RequireAdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}
  @Get('users') users(@Req() req: unknown) { return this.admin.users(resolvedActorFromRequest(req)); }
  @Post('users') createUser(@Body() dto: CreateUserDto, @Req() req: unknown) { return this.admin.createUser(dto, resolvedActorFromRequest(req)); }
  @Patch('users/:id') updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto, @Req() req: unknown) { return this.admin.updateUser(id, dto, resolvedActorFromRequest(req)); }
  @Post('users/:id/deactivate') deactivate(@Param('id') id: string, @Body() dto: DeactivateUserDto, @Req() req: unknown) { return this.admin.deactivateUser(id, dto ?? {}, resolvedActorFromRequest(req)); }
  @Get('departments') departments(@Req() req: unknown) { return this.admin.departments(resolvedActorFromRequest(req)); }
  @Post('departments') createDepartment(@Body() dto: CreateDepartmentDto, @Req() req: unknown) { return this.admin.createDepartment(dto, resolvedActorFromRequest(req)); }
  @Patch('departments/:id') updateDepartment(@Param('id') id: string, @Body() dto: UpdateDepartmentDto, @Req() req: unknown) { return this.admin.updateDepartment(id, dto, resolvedActorFromRequest(req)); }
  @Post('departments/:id/archive') archiveDepartment(@Param('id') id: string, @Req() req: unknown) { return this.admin.archiveDepartment(id, resolvedActorFromRequest(req)); }
  @Post('departments/:id/unarchive') unarchiveDepartment(@Param('id') id: string, @Req() req: unknown) { return this.admin.unarchiveDepartment(id, resolvedActorFromRequest(req)); }
  @Put('category-mappings/:category') mapping(@Param('category') category: string, @Body() dto: UpdateMappingDto, @Req() req: unknown) { return this.admin.updateMapping(category, dto, resolvedActorFromRequest(req)); }
  @Get('settings') settings(@Req() req: unknown) { return this.admin.settings(resolvedActorFromRequest(req)); }
  @Patch('settings') updateSettings(@Body() dto: UpdateSettingsDto, @Req() req: unknown) { return this.admin.updateSettings(dto, resolvedActorFromRequest(req)); }
  @Get('audit') audit(@Req() req: unknown) { return this.admin.auditEntries(resolvedActorFromRequest(req)); }
}
